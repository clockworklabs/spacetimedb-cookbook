// THIS FILE IS AUTOMATICALLY GENERATED BY SPACETIMEDB. EDITS TO THIS FILE
// WILL NOT BE SAVED. MODIFY TABLES IN YOUR MODULE SOURCE CODE INSTEAD.

#nullable enable

using System;
using System.Collections.Generic;
using System.Runtime.Serialization;

namespace SpacetimeDB.Types
{
    [SpacetimeDB.Type]
    [DataContract]
    public sealed partial class WebRequest
    {
        [DataMember(Name = "Id")]
        public int Id;
        [DataMember(Name = "RequestType")]
        public RequestType RequestType;
        [DataMember(Name = "Uri")]
        public string Uri;
        [DataMember(Name = "Payload")]
        public string Payload;

        public WebRequest(
            int Id,
            RequestType RequestType,
            string Uri,
            string Payload
        )
        {
            this.Id = Id;
            this.RequestType = RequestType;
            this.Uri = Uri;
            this.Payload = Payload;
        }

        public WebRequest()
        {
            this.Uri = "";
            this.Payload = "";
        }
    }
}
