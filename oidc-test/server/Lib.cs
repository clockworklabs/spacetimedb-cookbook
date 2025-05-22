using SpacetimeDB;

public static partial class Module
{
    [Table(Name = "person", Public = true)]
    [Table(Name = "offline_person", Public = false)]
    public partial struct Person
    {
        [PrimaryKey]
        public Identity Identity;
        public string Name;
        public string Bio;
    }

    [Reducer(ReducerKind.ClientConnected)]
    public static void Connect(ReducerContext ctx)
    {
        var existingPerson = ctx.Db.offline_person.Identity.Find(ctx.Sender);

        if (existingPerson is null)
        {
            ctx.Db.person.Insert(new Person
            {
                Identity = ctx.Sender,
                Name = "",
                Bio = ""
            });

            return;
        }

        ctx.Db.person.Insert(existingPerson.Value);
        ctx.Db.offline_person.Delete(existingPerson.Value);
    }

    [Reducer(ReducerKind.ClientDisconnected)]
    public static void Disconnect(ReducerContext ctx)
    {
        var existingPerson = ctx.Db.person.Identity.Find(ctx.Sender) ??
                             throw new Exception("Person should exist if they're logging off??");

        ctx.Db.offline_person.Insert(existingPerson);
        ctx.Db.person.Delete(existingPerson);
    }

    [Reducer]
    public static void UpdateSelf(ReducerContext ctx, string name, string bio)
    {
        var self = ctx.Db.person.Identity.Find(ctx.Sender) ??
                   throw new Exception("Identity calling this reducer does not exist in person table!?");

        ctx.Db.person.Identity.Update(new Person
        {
            Identity = ctx.Sender,
            Name = name,
            Bio = bio
        });
    }
}
