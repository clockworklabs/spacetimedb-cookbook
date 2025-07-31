using SpacetimeDB;

public static partial class Module
{
    [Table(Name = "message_config", Public = false)]
    public partial struct MessageConfig
    {
        [PrimaryKey]
        public uint Id;

        public uint MaxPublicMessages;
        public uint Count;
    }
    
    [Table(Name = "world_message", Public = true)]
    [Table(Name = "world_message_all", Public = false)]
    public partial struct WorldMessage
    {
        [PrimaryKey]
        public uint Id;
        public Identity Sender;
        public long Timestamp;
        public string Text;
    }

    [Table(Name = "player", Public = true)]
    [Table(Name = "signed_out_player", Public = false)]
    public partial struct Player
    {
        [PrimaryKey]
        public Identity Identity;

        public string Name;
    }

    [Reducer(ReducerKind.Init)]
    public static void Init(ReducerContext ctx)
    {
        ctx.Db.message_config.Insert(new MessageConfig
        {
            Id = 0,
            MaxPublicMessages = 10,
            Count = 0
        });
    }

    [Reducer(ReducerKind.ClientConnected)]
    public static void Connect(ReducerContext ctx)
    {
        var existingPlayer = ctx.Db.signed_out_player.Identity.Find(ctx.Sender);

        if (existingPlayer is null)
        {
            ctx.Db.player.Insert(new Player
            {
                Identity = ctx.Sender,
                Name = "Player" + ctx.Rng.Next(1,9999)
            });

            return;
        }
        
        ctx.Db.player.Insert(existingPlayer.Value);
        ctx.Db.signed_out_player.Delete(existingPlayer.Value);
    }

    [Reducer(ReducerKind.ClientDisconnected)]
    public static void Disconnect(ReducerContext ctx)
    {
        var existingPlayer = ctx.Db.player.Identity.Find(ctx.Sender) ?? throw new Exception("player should exist?");

        ctx.Db.signed_out_player.Insert(existingPlayer);
        ctx.Db.player.Delete(existingPlayer);
    }

    [Reducer]
    public static void SendMessage(ReducerContext ctx, string message)
    {
        var player = ctx.Db.player.Identity.Find(ctx.Sender) ?? throw new Exception("no such player found");
        var msgConfig = ctx.Db.message_config.Id.Find(0) ?? throw new Exception("couldn't find msgConfig?");

        if (ctx.Db.world_message.Count > msgConfig.MaxPublicMessages)
        {
            var messageToBeMoved = ctx.Db.world_message.Iter().ToList();
            messageToBeMoved.Sort((a, b) => a.Id.CompareTo(b.Id));
            ctx.Db.world_message_all.Insert(messageToBeMoved[0]);
            ctx.Db.world_message.Delete(messageToBeMoved[0]);
        }
        
        ctx.Db.world_message.Insert(new WorldMessage
        {
            Id = msgConfig.Count + 1,
            Sender = ctx.Sender,
            Timestamp = ctx.Timestamp.ToStd().ToUnixTimeSeconds(),
            Text = message
        });

        ctx.Db.message_config.Delete(msgConfig);

        msgConfig.Count++;
        ctx.Db.message_config.Insert(msgConfig);
    }
}
