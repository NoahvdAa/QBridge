# QBridge

QBridge is a Discord <-> WhatsApp bridge featuring an API for bot integrations.

Documentation will be added soon™️

## How to set up

1. Install the required dependencies with `yarn install`.
2. Copy `config.example.json` to `config.json` and change the settings to your needs.
3. Start the bridge with `yarn start`. If this is the first time running the bridge, you will need to sign into WhatsApp web. The easiest way to do this is to simply disable headless mode in `config.json`, so chromium will open in a normal, visible window and you can scann the QR code.
4. Use a database client of your choice to add a row to the `channels` table. 
5. Send a message in the Discord channel or WhatsApp chat and watch it get bridged!
