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
        public delegate void SendMessageHandler(ReducerEventContext ctx, string message);
        public event SendMessageHandler? OnSendMessage;

        public void SendMessage(string message)
        {
            conn.InternalCallReducer(new Reducer.SendMessage(message), this.SetCallReducerFlags.SendMessageFlags);
        }

        public bool InvokeSendMessage(ReducerEventContext ctx, Reducer.SendMessage args)
        {
            if (OnSendMessage == null) return false;
            OnSendMessage(
                ctx,
                args.Message
            );
            return true;
        }
    }

    public abstract partial class Reducer
    {
        [SpacetimeDB.Type]
        [DataContract]
        public sealed partial class SendMessage : Reducer, IReducerArgs
        {
            [DataMember(Name = "message")]
            public string Message;

            public SendMessage(string Message)
            {
                this.Message = Message;
            }

            public SendMessage()
            {
                this.Message = "";
            }

            string IReducerArgs.ReducerName => "SendMessage";
        }
    }

    public sealed partial class SetReducerFlags
    {
        internal CallReducerFlags SendMessageFlags;
        public void SendMessage(CallReducerFlags flags) => SendMessageFlags = flags;
    }
}
