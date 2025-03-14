// THIS FILE IS AUTOMATICALLY GENERATED BY SPACETIMEDB. EDITS TO THIS FILE
// WILL NOT BE SAVED. MODIFY TABLES IN YOUR MODULE SOURCE CODE INSTEAD.

#nullable enable

using System;
using SpacetimeDB.BSATN;
using SpacetimeDB.ClientApi;
using System.Collections.Generic;
using System.Runtime.Serialization;

namespace SpacetimeDB.Types
{
    public sealed partial class RemoteTables
    {
        public sealed class WorldMessageHandle : RemoteTableHandle<EventContext, WorldMessage>
        {
            protected override string RemoteTableName => "world_message";

            public sealed class IdUniqueIndex : UniqueIndexBase<uint>
            {
                protected override uint GetKey(WorldMessage row) => row.Id;

                public IdUniqueIndex(WorldMessageHandle table) : base(table) { }
            }

            public readonly IdUniqueIndex Id;

            internal WorldMessageHandle(DbConnection conn) : base(conn)
            {
                Id = new(this);
            }

            protected override object GetPrimaryKey(WorldMessage row) => row.Id;
        }

        public readonly WorldMessageHandle WorldMessage;
    }
}
