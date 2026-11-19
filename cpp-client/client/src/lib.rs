mod module_bindings;

use std::pin::Pin;

use anyhow::{Error as AnyError, Result};
use cxx::{let_cxx_string, CxxString, CxxVector};
use module_bindings::{add, say_hello, PersonTableAccess};
use spacetimedb_sdk::{DbContext, Table};

use crate::module_bindings::{DbConnection, Person};

#[cxx::bridge(namespace = "stdb")]
mod ffi {

    extern "Rust" {
        type DbConnection;
        fn connect(uri: &CxxString, db: &CxxString) -> Result<Box<DbConnection>>;
        fn run_threaded(ctx: &DbConnection);

        // subscriptions
        fn subscribe(
            ctx: &DbConnection,
            subs: &CxxVector<CxxString>,
            on_applied_ptr: usize,
            on_err_ptr: usize,
        );
        fn subscribe_to_all(ctx: &DbConnection);

        // reducers
        #[namespace = "stdb::reducers"]
        fn say_hello(ctx: &DbConnection) -> Result<()>;
        #[namespace = "stdb::reducers"]
        fn add(ctx: &DbConnection, name: &CxxString) -> Result<()>;

        // tables
        #[namespace = "stdb::tables"]
        type Person;
        #[namespace = "stdb::tables::person"]
        #[rust_name = "person_name"]
        fn name(p: &Person) -> String;

        #[namespace = "stdb::tables::person"]
        #[rust_name = "person_iter"]
        fn iter(ctx: &DbConnection) -> Vec<Person>;
    }
}

// Common stuff
fn connect(host_uri: &CxxString, db_name: &CxxString) -> Result<Box<DbConnection>> {
    let uri = host_uri.to_string();
    let name = db_name.to_string();

    Ok(Box::new(
        DbConnection::builder()
            .with_module_name(name)
            .with_uri(uri)
            .build()?,
    ))
}

fn run_threaded(ctx: &DbConnection) {
    ctx.run_threaded();
}

fn subscribe(
    ctx: &DbConnection,
    subs: &CxxVector<CxxString>,
    on_applied_ptr: usize,
    on_err_ptr: usize,
) {
    let rsubs: Vec<String> = subs.iter().map(|s| s.to_string()).collect();
    ctx.subscription_builder()
        .on_applied(move |_| {
            if on_applied_ptr != 0 {
                let func: fn() = unsafe { std::mem::transmute(on_applied_ptr) };

                func();
            }
        })
        .on_error(move |_, e| {
            if on_err_ptr != 0 {
                let func: fn(Pin<&mut CxxString>) = unsafe { std::mem::transmute(on_err_ptr) };

                let_cxx_string!(err = e.to_string());
                func(err);
            }
        })
        .subscribe(rsubs);
}

fn subscribe_to_all(ctx: &DbConnection) {
    ctx.subscription_builder().subscribe_to_all_tables();
}

// reducers
fn say_hello(ctx: &DbConnection) -> Result<()> {
    ctx.reducers.say_hello().map_err(AnyError::from)
}

fn add(ctx: &DbConnection, name: &CxxString) -> Result<()> {
    ctx.reducers.add(name.to_string()).map_err(AnyError::from)
}

// tables

fn person_name(p: &Person) -> String {
    p.name.clone()
}

fn person_iter(ctx: &DbConnection) -> Vec<Person> {
    ctx.db.person().iter().collect()
}
