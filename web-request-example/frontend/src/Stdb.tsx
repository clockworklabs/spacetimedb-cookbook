import { Identity } from "@clockworklabs/spacetimedb-sdk";
import { DbConnection, type ErrorContext } from "./module_bindings";

export class Stdb extends EventTarget {
    private static TOKEN_KEY = 'stdb_weather';

    private static _instance: Stdb | null = null;
    public static get instance(): Stdb {
        if(!Stdb._instance) {
            throw new Error('Stdb is not initialized');
        }
        return Stdb._instance;
    }

    public readonly conn!: DbConnection;

    private _connected: boolean = false;
    public get connected(): boolean {
        return this._connected;
    }

    private _identity: Identity | null = null;
    public get identity(): Identity {
        if(!this._identity) {
            throw new Error('Stdb not connected');
        }
        return this._identity;
    }

    constructor(uri: string, moduleName: string) {
        if (Stdb._instance) return Stdb._instance;

        super();
        Stdb._instance = this;

        const token = localStorage.getItem(Stdb.TOKEN_KEY) || "";

        this.conn = DbConnection.builder()
            .withUri(uri)
            .withModuleName(moduleName)
            .withToken(token)
            .onConnect(this.onConnect.bind(this))
            .onDisconnect(this.onDisconnect.bind(this))
            .onConnectError(this.onConnectError.bind(this))
            .withCompression("none")
            .build();
    }

    private onConnect(_conn: DbConnection, identity: Identity, token: string) {
        this._identity = identity;

        localStorage.setItem(Stdb.TOKEN_KEY, token);

        console.log("Connected to SpacetimeDB! [" + identity.toHexString() + "]");

        _conn.subscriptionBuilder().onApplied(() => {
            this.dispatchEvent(new Event('onApplied'));
        }).subscribe([
            "SELECT * FROM Weather"
        ]);

        this._connected = true;
        this.dispatchEvent(new Event('connect'));
    }

    private onDisconnect() {
        console.log("Disconnected from SpacetimeDB");
        
        this._connected = false;
        this.dispatchEvent(new Event('disconnect'));
    }

    private onConnectError(_ctx: ErrorContext, err: Error) {
        console.log("Error connecting to SpacetimeDB: ", err);

        this._connected = false;
        this.dispatchEvent(new Event('error'));
    }
}