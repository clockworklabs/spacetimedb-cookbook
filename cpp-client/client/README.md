## STDB C++ Example client

This project serves to demonstrate that it is possible to use rust <==> c++ bridge generation to quickly put together enough glue code between the two and enable a C++ client to be created and used from the rust client.

### Notes:

This project was make for linux however adjusting for other platforms shouldnt be too difficult.

## Build Requirements

* rust
* cxxbridge (`cargo install cxxbridge-cmd`)
* spacetime-cli
* openssl
* c++ compiler (g++ in this case)

optional:

* just (only if you want to run the build scripts directly, easily reproduced)

## Usage

The provided justfile has the following recipes:
* `generate` - Regenerates the rust client from the server using `spacetime generate`
* `build`    - Builds the rust static library, re-generates the c++ header, builds the c++ client
* `run`      - Builds and then runs the client

