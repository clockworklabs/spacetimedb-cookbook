using SpacetimeDB;

public static partial class Module
{
    [SpacetimeDB.Table(Name = "voice_data", Public = true)]
    public partial struct voice_data
    {
        [SpacetimeDB.AutoInc]
        [SpacetimeDB.PrimaryKey]
        public uint id;
        public float[] data;
    }

    [SpacetimeDB.Table(Name = "voice_data_delete_schedule", Scheduled = nameof(scheduled_delete),
        ScheduledAt = nameof(scheduled_at), Public = false)]
    public partial struct voice_data_delete_schedule
    {
        [PrimaryKey] [AutoInc] public ulong Id;
        public ScheduleAt scheduled_at;
        public uint voice_data_id;
    }

    [SpacetimeDB.Reducer]
    public static void add_voice_data(ReducerContext ctx, float[] data)
    {
        var person = ctx.Db.voice_data.Insert(new voice_data { data = data });

        ctx.Db.voice_data_delete_schedule.Insert(new voice_data_delete_schedule
        {
            scheduled_at = ctx.Timestamp.ToStd().AddSeconds(3),
            voice_data_id = person.id
        });
    }

    [SpacetimeDB.Reducer]
    public static void scheduled_delete(ReducerContext ctx, voice_data_delete_schedule arg)
    {
        if (ctx.Sender != ctx.Identity) return;
        var data = ctx.Db.voice_data.id.Find(arg.voice_data_id);
        if (data is null) return;
        
        ctx.Db.voice_data.Delete(data.Value);
    }
}
