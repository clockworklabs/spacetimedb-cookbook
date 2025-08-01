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
        public delegate void ClearWeatherHandler(ReducerEventContext ctx);
        public event ClearWeatherHandler? OnClearWeather;

        public void ClearWeather()
        {
            conn.InternalCallReducer(new Reducer.ClearWeather(), this.SetCallReducerFlags.ClearWeatherFlags);
        }

        public bool InvokeClearWeather(ReducerEventContext ctx, Reducer.ClearWeather args)
        {
            if (OnClearWeather == null)
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
            OnClearWeather(
                ctx
            );
            return true;
        }
    }

    public abstract partial class Reducer
    {
        [SpacetimeDB.Type]
        [DataContract]
        public sealed partial class ClearWeather : Reducer, IReducerArgs
        {
            string IReducerArgs.ReducerName => "ClearWeather";
        }
    }

    public sealed partial class SetReducerFlags
    {
        internal CallReducerFlags ClearWeatherFlags;
        public void ClearWeather(CallReducerFlags flags) => ClearWeatherFlags = flags;
    }
}
