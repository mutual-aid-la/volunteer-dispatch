const Airtable = require("airtable");
const Task = require("./task");
const config = require("./config");
const CustomAirtable = require("./custom-airtable");
const { logger } = require("./logger");

const { sendMessage } = require("./slack");
const { getCoords, distanceBetweenCoords } = require("./geo");
require("dotenv").config();

/* System notes:
 * - Certain tasks should probably have an unmatchable requirement (because the tasks requires
 *   looking a shortlist of specialized volunteers)
 * - Airtable fields that start with '_' are system columns, not to be updated manually
 * - If the result seems weird, verify the addresses of the request/volunteers
 */

// Airtable
const base = new Airtable({ apiKey: config.AIRTABLE_API_KEY }).base(
  config.AIRTABLE_BASE_ID
);
const customAirtable = new CustomAirtable(base);

function fullAddress(record) {
  return `${record.get("Address")} ${record.get("City")}, ${
    config.VOLUNTEER_DISPATCH_STATE
  }`;
}

// Accepts errand address and checks volunteer spreadsheet for closest volunteers
async function findVolunteers(request) {
  const volunteerDistances = [];

  const tasks = (request.get("Tasks") || []).map(Task.mapFromRawTask);
  let errandCoords;
  try {
    errandCoords = await getCoords(fullAddress(request));
  } catch (e) {
    logger.error(
      `Error getting coordinates for requester ${request.get(
        "Name"
      )} with error: ${JSON.stringify(e)}`
    );
    customAirtable.logErrorToTable(
      config.AIRTABLE_REQUESTS_TABLE_NAME,
      request,
      e,
      "getCoords"
    );
    return [];
  }

  logger.info(`Tasks: ${tasks.map((task) => task.rawTask).join(", ")}`);

  // Figure out which volunteers can fulfill at least one of the tasks
  await base(config.AIRTABLE_VOLUNTEERS_TABLE_NAME)
    .select({ view: "Grid view" })
    .eachPage(async (volunteers, nextPage) => {
      const suitableVolunteers = volunteers.filter((volunteer) =>
        tasks.some((task) => task.canBeFulfilledByVolunteer(volunteer))
      );

      // Calculate the distance to each volunteer
      for (const volunteer of suitableVolunteers) {
        const volAddress =
          volunteer.get(
            "Full Street address (You can leave out your apartment/unit.)"
          ) || "";

        // Check if we need to retrieve the addresses coordinates
        // NOTE: We do this to prevent using up our free tier queries on Mapquest (15k/month)
        if (volAddress !== volunteer.get("_coordinates_address")) {
          let newVolCoords;
          try {
            newVolCoords = await getCoords(volAddress);
          } catch (e) {
            logger.info(
              "Unable to retrieve volunteer coordinates:",
              volunteer.get("Full Name")
            );
            customAirtable.logErrorToTable(
              config.AIRTABLE_VOLUNTEERS_TABLE_NAME,
              volunteer,
              e,
              "getCoords"
            );
            continue;
          }

          volunteer.patchUpdate({
            _coordinates: JSON.stringify(newVolCoords),
            _coordinates_address: volAddress,
          });
          volunteer.fetch();
        }

        // Try to get coordinates for this volunteer
        let volCoords;
        try {
          volCoords = JSON.parse(volunteer.get("_coordinates"));
        } catch (e) {
          logger.info(
            "Unable to parse volunteer coordinates:",
            volunteer.get("Full Name")
          );
          continue;
        }

        // Calculate the distance
        const distance = distanceBetweenCoords(volCoords, errandCoords);
        volunteerDistances.push([volunteer, distance]);
      }

      nextPage();
    });

  // Sort the volunteers by distance and grab the closest 10
  const closestVolunteers = volunteerDistances
    .sort((a, b) => a[1] - b[1])
    .slice(0, 10)
    .map((volunteerAndDistance) => {
      const [volunteer, distance] = volunteerAndDistance;
      return {
        Name: volunteer.get("Full Name"),
        Number: volunteer.get("Please provide your contact phone number:"),
        Distance: distance,
        record: volunteer,
      };
    });

  logger.info("Closest:");
  closestVolunteers.forEach((v) => {
    logger.info(`${v.Name} ${v.Distance.toFixed(2)} Mi`);
  });

  return closestVolunteers;
}

// Checks for updates on errand spreadsheet, finds closest volunteers from volunteer spreadsheet and
// executes slack message if new row has been detected
async function checkForNewSubmissions() {
  base(config.AIRTABLE_REQUESTS_TABLE_NAME)
    .select({ view: "Grid view" })
    .eachPage(async (records, nextPage) => {
      // Remove records we don't want to process from the array.
      const cleanRecords = records.filter((r) => {
        if (typeof r.get("Name") === "undefined") return false;
        if (r.get("Posted to Slack?") === "yes") return false;
        return true;
      });

      // Look for records that have not been posted to slack yet
      for (const record of cleanRecords) {
        logger.info(`New help request for: ${record.get("Name")}`);

        // Find the closest volunteers
        const volunteers = await findVolunteers(record);

        // Send the message to Slack
        let messageSent = false;
        try {
          await sendMessage(record, volunteers);
          messageSent = true;
          logger.info("Posted to Slack!");
        } catch (error) {
          logger.error("Unable to post to Slack: ", error);
        }

        if (messageSent) {
          await record
            .patchUpdate({
              "Posted to Slack?": "yes",
              Status: record.get("Status") || "Needs assigning", // don't overwrite the status
            })
            .then(logger.info("Updated Airtable record!"))
            .catch((error) => logger.error(error));
        }
      }

      nextPage();
    });
}

async function start() {
  try {
    logger.info("Volunteer Dispatch started!");
    checkForNewSubmissions();
    setInterval(checkForNewSubmissions, 15000);
  } catch (error) {
    logger.error(error);
  }
}

process.on("unhandledRejection", (reason, p) => {
  logger.error("Unhandled Rejection at: Promise", p, "reason:", reason);
  // application specific logging, throwing an error, or other logic here
});

start();
