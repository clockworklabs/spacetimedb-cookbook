// THIS FILE IS AUTOMATICALLY GENERATED BY SPACETIMEDB. EDITS TO THIS FILE
// WILL NOT BE SAVED. MODIFY TABLES IN YOUR MODULE SOURCE CODE INSTEAD.

#nullable enable

using System;
using SpacetimeDB.ClientApi;
using System.Collections.Generic;
using System.Runtime.Serialization;

namespace SpacetimeDB.Types
{
    public sealed partial class RemoteReducers : RemoteBase
    {
        public delegate void AddKnownIdentityHandler(ReducerEventContext ctx, string identity);
        public event AddKnownIdentityHandler? OnAddKnownIdentity;

        public void AddKnownIdentity(string identity)
        {
            conn.InternalCallReducer(new Reducer.AddKnownIdentity(identity), this.SetCallReducerFlags.AddKnownIdentityFlags);
        }

        public bool InvokeAddKnownIdentity(ReducerEventContext ctx, Reducer.AddKnownIdentity args)
        {
            if (OnAddKnownIdentity == null)
            {
                if (InternalOnUnhandledReducerError != null)
                {
                    switch (ctx.Event.Status)
                    {
                        case Status.Failed(var reason): InternalOnUnhandledReducerError(ctx, new Exception(reason)); break;
                        case Status.OutOfEnergy(var _): InternalOnUnhandledReducerError(ctx, new Exception("out of energy")); break;
                    }
                }
                return false;
            }
            OnAddKnownIdentity(
                ctx,
                args.Identity
            );
            return true;
        }
    }

    public abstract partial class Reducer
    {
        [SpacetimeDB.Type]
        [DataContract]
        public sealed partial class AddKnownIdentity : Reducer, IReducerArgs
        {
            [DataMember(Name = "identity")]
            public string Identity;

            public AddKnownIdentity(string Identity)
            {
                this.Identity = Identity;
            }

            public AddKnownIdentity()
            {
                this.Identity = "";
            }

            string IReducerArgs.ReducerName => "AddKnownIdentity";
        }
    }

    public sealed partial class SetReducerFlags
    {
        internal CallReducerFlags AddKnownIdentityFlags;
        public void AddKnownIdentity(CallReducerFlags flags) => AddKnownIdentityFlags = flags;
    }
}
