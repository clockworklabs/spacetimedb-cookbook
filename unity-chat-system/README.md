# Unity Chat System

The purpose of this example is to show how to add a simple chat system into your Unity game.

## Getting Started

### Server

First, if you haven't already, install SpacetimeDB: https://spacetimedb.com/install

Once you have the SpacetimeDB CLI installed, run `spacetime start`:
```
$ spacetime start

...

spacetimedb-standalone.exe version: 1.1.2
spacetimedb-standalone.exe path: C:\Users\boppy\AppData\Local\SpacetimeDB\bin\current\spacetimedb-standalone.exe
database running in data directory C:\Users\boppy\AppData\Local\SpacetimeDB\data
2025-06-04T15:25:44.821175Z DEBUG D:\a\SpacetimeDB\SpacetimeDB\crates\standalone\src\subcommands\start.rs:148: Starting SpacetimeDB listening on 0.0.0.0:3000
```

Then, in a separate terminal, navigate to the `server` directory. It should look something like this:

```
$ ls
bin/  global.json  Lib.cs  obj/  StdbModule.csproj
```

Then publish the module to your local server:

```
spacetime publish -s local chat-system
```

You should see something like this:
```
$ spacetime publish -s local chat-system

Workload updates are available. Run `dotnet workload list` for more information.
Optimising module with wasm-opt...
Could not find wasm-opt to optimise the module.
For best performance install wasm-opt from https://github.com/WebAssembly/binaryen/releases.
Continuing with unoptimised module.
Build finished successfully.
Uploading to local => http://127.0.0.1:3000
Publishing module...
Created new database with name: chat-system, identity: c2007836f32da26dd7605e8c4633c5516306ebef93aad3151360651fa3cdb81d
```

Now you're ready to open the client!

### Client

First open `client/spacetimedb-chat-system` in Unity. Any version `2022.3.32f1 LTS` or newer should work. Check here for the latest requirements: https://spacetimedb.com/docs/unity

Then open the scene named `SampleScene`. Enter play mode and give it a try! If you want to test with another client you can build the game and start it as a 2nd client.

### Next Steps

- Try publishing this example to SpacetimeDB Maincloud and try it with some friends! https://spacetimedb.com/docs/deploying/maincloud
- Integrate this example into your game
