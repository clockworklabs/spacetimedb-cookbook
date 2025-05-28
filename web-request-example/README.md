GET requests, POST requests, Web Requests, Oh my!
I've done a lot of yapping about special clients and whatnot, and how they can be used for web-requests, or even IO calls to a host machine, however I haven't seen anyone actually build something with 'em. So I figured I'd put a little proof-of-concept out there for those who may be a bit intimidated by the concept. 

There is a typescript frontend, a c# special-client, and a c# module. The module is pretty simple for the purposes of this demo:

Tables:
- `KnownIdentities` - Used to house the identities w/ special permissions to call protected reducers and read the protected `WebRequests` table
- `WebRequests` - This table keeps the web requests that the module would like to make. It's protected by row-level security, so that you could theoretically store sensitive data (like an api key or something) in it.
- `Weather` - A simple data table, we're calling a weather endpoint and dumping the data in here.

Reducers:
- `RequestWeather` - Our typescript client will call this reducer, which will add a web-request to the `WebRequests` table.
- `ClearWeather` - A reducer to clear out the Weather so you can run the example again.
- `ReturnWeather` - A `KnownIdentities` protected reducer, which parses the web-request JSON return into the `Weather` data table.
- `AddKnownIdentity` - A `KnownIdentities` protected reducer, which adds a hexString identity to the known identities table.

By default, the module will add the publisher/owner's Identity to the `KnownIdentities` table. You can manually add identities to the table via the command line, example: `spacetime call weather AddKnownIdentity C200DE44A3DAE7DE2E1FE0EEFC3E3BF62B970A011C65EE28247E39617B017057`.

You must start the c# special-client before running the `RequestWeather` reducer, as the c# special-client is the one that will be listening to this table and making the web-requests on behalf of the server. 