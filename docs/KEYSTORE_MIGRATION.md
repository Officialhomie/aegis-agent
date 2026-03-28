# Foundry Keystore Migration

After migrating the agent wallet to Foundry keystores, you can remove the plaintext private key from `.env` to avoid exposure.

## Steps

1. **Import your existing key into Foundry keystore**
   ```bash
   cast wallet import aegis-agent --interactive
   ```
   Enter your current private key (e.g. the value of `EXECUTE_WALLET_PRIVATE_KEY`) and choose a password.

2. **Set in `.env`**
   ```bash
   KEYSTORE_ACCOUNT="aegis-agent"
   KEYSTORE_PASSWORD="your-chosen-password"
   ```
   Or use `CAST_PASSWORD` for non-interactive use (e.g. CI).

3. **Verify**
   ```bash
   cast wallet address --account aegis-agent
   ```
   Ensure the address matches `AGENT_WALLET_ADDRESS`.

4. **Remove plaintext key from `.env`**
   Delete or comment out `EXECUTE_WALLET_PRIVATE_KEY` and `AGENT_PRIVATE_KEY` so the key is never stored in the environment file.

The agent will load the key from the encrypted keystore at runtime; only the password is in `.env`, and the key is never stored in plaintext.
