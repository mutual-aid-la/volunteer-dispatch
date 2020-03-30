# Volunteer Dispatch

A bot which locates the closest volunteers to check-in on & run errands for vulnerable members of the community.

*Made by [Astoria Tech](https://github.com/astoria-tech) volunteers for use by the [Astoria Mutual Aid Network](https://astoriamutualaid.com).*

## How it works

Astoria Mutual Aid Network’s volunteer dispatch works as follows:

- People fill out a form to request help (https://astoriamutualaid.com/help) which feeds into Airtable
- The bot (a node.js container) watches the Airtable sheet for new entries (every 15 seconds)
- When a new entry is found, the request address is cross-referenced against the volunteer list to
  find the 10 closest volunteers who can fulfill the need, and posts them to a private dispatch channel
  on Slack (where we have trained dispatch volunteers coordinating with the field volunteers).

## Software requirements

- Make
- Docker & Docker Compose

## Integration requirements

Get the integration points setup:

- an Airtable account - sign up for a free account, then fill out this form to get a year free as a relief group: https://airtable.com/shr2yzaeJmeuhbyrD
- a free MapQuest dev account - https://developer.mapquest.com/plan_purchase/steps/business_edition/business_edition_free/register
- a dedicated private Slack channel for the bot to post to

And grab the API keys from each (and channel ID for Slack), and put them into the following enviornment variables:

- `AIRTABLE_API_KEY`
- `MAPQUEST_KEY`
- `SLACK_XOXB` - Slack bot token. To setup: create an app, add the OAuth `chat:write` bot scope, install the app to a channel, and grab the bot token
- `SLACK_CHANNEL_ID` - Slack channel ID, something like `C0107MVRF08`

## How to run

- Clone this repo and navigate to the project root in your terminal>
- Set the environment variables documented above.
- Run `make develop` and the bot will start running, processing records every 15 seconds.

## Example data

Volunteers: https://airtable.com/shrx37haiGAG7uRj1/tblcapvKLgHEmpQPN?blocks=hide
Help Requests: https://airtable.com/shrhx8oySmpSDjvYK/tblPvXZgjE21iTT2e?blocks=hide
