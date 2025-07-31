using System.Diagnostics;
using SpacetimeDB;
using SpacetimeDB.Types;
using System.Net.Http;
using System.Threading.Tasks;

namespace special_client
{
    public class HttpHelper
    {
        private static readonly HttpClient client = new HttpClient();

        public static async Task<string> GetUrlAsync(string url)
        {
            HttpResponseMessage response = await client.GetAsync(url);
            response.EnsureSuccessStatusCode(); 
            string responseBody = await response.Content.ReadAsStringAsync();
            return responseBody;
        }
    }

    public class Program
    {
        private const string TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJoZXhfaWRlbnRpdHkiOiJjMjAwZGU0NGEzZGFlN2RlMmUxZmUwZWVmYzNlM2JmNjJiOTcwYTAxMWM2NWVlMjgyNDdlMzk2MTdiMDE3MDU3Iiwic3ViIjoiZjQwMzc3MDQtNjIwZS00NGU2LWI4ZGItYWU4YTU4ZjY1M2VjIiwiaXNzIjoibG9jYWxob3N0IiwiYXVkIjpbInNwYWNldGltZWRiIl0sImlhdCI6MTc0ODM5OTg4MCwiZXhwIjpudWxsfQ.fqyu2Q5KlPccpZAi3GPc25d2XIrlek4w1f5An5EjX0YxEDUJIPHs2QYTqxnrPT9qHx_7LnuU8o9xu0ARQ878jA";
        private const string DOMAIN = "http://localhost:3000";
        private const string MODULE = "weather";

        private static Identity localIdentity;
        
        static void Main(string[] args)
        {
            AuthToken.Init("weather-app");

            DbConnection conn = ConnectToDB();
            RegisterCallbacks(conn);
            
            var cancellationTokenSource = new CancellationTokenSource();
            var thread = new Thread(() => ProcessThread(conn, cancellationTokenSource.Token));
            thread.Start();

            InputLoop();
            
            cancellationTokenSource.Cancel();
            thread.Join();
        }
        
        static DbConnection ConnectToDB()
        {
            return DbConnection.Builder()
                .WithToken(TOKEN)
                .WithUri(DOMAIN)
                .WithModuleName(MODULE)
                .OnConnect(OnConnect)
                .OnConnectError(OnConnectError)
                .OnDisconnect(OnDisconnect)
                .Build();
        }

        private static void OnConnect(DbConnection conn, Identity identity, string token)
        {
            localIdentity = identity;
            Console.WriteLine($"Connected to SpacetimeDB [{identity}]");

            conn.SubscriptionBuilder().OnApplied(OnSubscriptionsApplied).Subscribe(new[]
            {
                "SELECT * FROM WebRequests"
            });
        }

        private static void OnSubscriptionsApplied(SubscriptionEventContext obj)
        {
            Console.WriteLine("Now listening for web requests!");
        }

        private static void OnConnectError(Exception e)
        {
            Console.WriteLine($"Error: {e.Message}");
        }

        private static void OnDisconnect(DbConnection conn, Exception? e)
        {
            Console.WriteLine($"Disconnected from SpacetimeDB w/ message: {e.Message}");
        }

        static void RegisterCallbacks(DbConnection conn)
        {
            conn.Db.WebRequests.OnInsert += WebRequests_OnInsert;
        }

        private async static void WebRequests_OnInsert(EventContext ctx, WebRequest row)
        {
            Console.WriteLine("Fetching web request...");
            try
            {
                var result = await HttpHelper.GetUrlAsync(row.Uri);
                ctx.Reducers.ReturnWeather(result);
                Console.WriteLine("Success! Called return.");
            }
            catch (Exception e)
            {
                Console.WriteLine($"Error trying to get result from API: {e.Message}");
            }
        }

        static void ProcessThread(DbConnection conn, CancellationToken ct)
        {
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    conn.FrameTick();
                    Thread.Sleep(100);
                }
            }
            finally
            {
                conn.Disconnect();
            }
        }

        static void InputLoop()
        {
            while (true)
            {
                var input = Console.ReadLine();
                
                if (input == "exit") break;
            }
        }
    }
}