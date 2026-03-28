# Receiving WhatsApp Replies from Another Number

If you message the Aegis/OpenClaw WhatsApp from a **different** number and get **no response**, the channel is only allowing the number currently in the allowlist.

## Quick fix

1. Open your OpenClaw config:
   ```bash
   open -e ~/.openclaw/openclaw.json
   ```
2. Find `channels.whatsapp.allowFrom`. It will look like:
   ```json
   "allowFrom": ["+2347067234836"]
   ```
3. Add your other number in E.164 format (country code + number, no spaces), for example:
   ```json
   "allowFrom": ["+2347067234836", "+12345678901"]
   ```
4. Save the file.
5. Restart the gateway:
   ```bash
   openclaw gateway restart
   ```
6. Send a message again from the other number; you should get a reply.

## More options

For full troubleshooting (pairing mode, allowing all senders), see [OPENCLAW_INTEGRATION.md](./OPENCLAW_INTEGRATION.md#no-response-when-messaging-from-another-number).
