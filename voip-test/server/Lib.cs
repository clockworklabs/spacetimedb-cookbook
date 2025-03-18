using SpacetimeDB;

public static partial class Module
{
    [SpacetimeDB.Table(Name = "voice_data", Public = true)]
    public partial struct voice_data
    {
        [SpacetimeDB.AutoInc]
        [SpacetimeDB.PrimaryKey]
        public int id;
        public float[] data;
    }

    [SpacetimeDB.Reducer]
    public static void add_voice_data(ReducerContext ctx, float[] data)
    {
        var person = ctx.Db.voice_data.Insert(new voice_data { data = data });
    }
}
