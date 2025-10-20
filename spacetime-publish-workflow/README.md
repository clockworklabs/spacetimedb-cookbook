## Description

This is an example of a Github workflow file that you can use to automatically publish updates to a SpacetimeDB module. However, if you make changes to your schema which are incompatible with the existing data (e.g. removing a column from a table) you will not be able to automatically upgrade your database. To help with this, this example includes reporting the success/failure to discord after the upgrade has been attempted.

### Project Language

You will need to install the dependencies of your target language. If your module is in rust you will need to install cargo, if it's in C# you'll need to install dotnet, etc. You can see that in the following step:

```
################################################################################
# Install Rust and build (UNCOMMENT this block if your project is Rust)
################################################################################
# echo "Setting up Rust toolchain…"
# rustup --version >/dev/null 2>&1 || curl https://sh.rustup.rs -sSf | sh -s -- -y
# echo "$HOME/.cargo/bin" >> "$GITHUB_PATH"
# rustc --version
# cargo --version
# cargo build --release

################################################################################
# Install .NET and build (UNCOMMENT this block if your project is .NET)
################################################################################
# echo "Setting up .NET…"
# sudo apt-get update -y
# sudo apt-get install -y dotnet-sdk-8.0 || true
# dotnet --info
# dotnet restore
# dotnet build -c Release

################################################################################
# Install Node + pnpm and build (UNCOMMENT this block if your project is JS/TS)
################################################################################
# echo "Setting up Node + pnpm…"
# corepack enable
# corepack prepare pnpm@latest --activate
# node --version
# pnpm --version
# pnpm install --frozen-lockfile || pnpm install
# pnpm build || npm run build || true
```

Just uncomment the one you want to use.


### Required Secrets/Variables

Secrets:
- `SPACETIMEDB_TOKEN` - This is your login token. This token *must* authenticate the identity which owns the database you are trying to update.
- `DISCORD_WEBHOOK_URL` - The Discord webhook to use for posting updates.

Vars:
- `DATABASE_NAME` - The name of the database you are trying to update.
- `PUBLISH_DIR` - Where inside of your repo we need to `cd` into in order to publish your module.

Once all of these are set, just move your workflow file into `.github/workflows/spacetime.yml` and it should start working when you merge PRs into master/main!
