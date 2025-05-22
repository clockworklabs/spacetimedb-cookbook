## STDB Python Example client

This project serves to demonstrate that it is possible to use rust <==> python wheel generation to quickly put together enough glue code between the two and enable a Python client to be created and used from the rust client.

### Notes:

This project was make for linux however adjusting for other platforms shouldnt be too difficult.

## Build Requirements

* rust
* python 
* spacetime-cli

optional:

* just (only if you want to run the build scripts directly, easily reproduced)

## Usage

The provided justfile has the following recipes:
* `generate` - Regenerates the rust client from the server using `spacetime generate`
* `venv`     - Initializes a Venv to setup the python enviroment and install dependencies
* `build`    - Builds the python client wheel, using the generated rust client
* `run`      - Builds as debug and then runs the client 

