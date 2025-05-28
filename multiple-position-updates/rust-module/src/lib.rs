// It would be better to break this down into "chunks" instead of using float positions
// for subscription updates so that we're comparing int values instead of floats but the
// performance here should still be really good.
//
// Clients will subscribe via something like this:
//   SELECT * FROM entity_position_hr WHERE transform.position.x <= (my_pos_x + 10)
//                                       AND transform.position.x >= (my_pos_x - 10)
//                                       AND transform.position.z <= (my_pos_z + 10)
//                                       AND transform.position.z >= (my_pos_z + 10)
//   SELECT * FROM entity_position_lr WHERE transform.position.x > (my_pos_x + 10)
//                                       OR transform.position.x < (my_pos_x - 10)
//                                       OR transform.position.z > (my_pos_z + 10)
//                                       OR transform.position.z < (my_pos_z + 10)
//
// If this is a game where the Y matters (like a flight sim) then you should filter
// on Y as well.
//
// We are subscribed to updates in entity_position_hr for things that are near us and then
// we are subscribed to entities in entity_position_lr for things that are not near us. You
// can see that the queries are inverted where there should be no rows that are returned as
// part of both queries. Also I would note again, you could update the low resolution types
// to have a smaller precision, like theoretically you could use f16 instead of f32.

use std::time::Duration;
use spacetimedb::{Identity, ReducerContext, SpacetimeType, Table};

#[derive(SpacetimeType, Clone)]
pub struct StdbPosition {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(SpacetimeType, Clone)]
pub struct StdbRotation {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

#[derive(SpacetimeType, Clone)]
pub struct StdbTransform {
    position: StdbPosition,
    rotation: StdbRotation,
}

// Intentionally private
#[spacetimedb::table(name = update_config)]
pub struct UpdateConfig {
    #[unique]
    id: u32,
    value: i32,
}

#[spacetimedb::table(name = entity, public)]
pub struct Entity {
    #[unique]
    id: u32,
    #[unique]
    identity: Identity,
    #[unique]
    username: String,
}

// We'll update this table 20 times per second
#[spacetimedb::table(name = entity_position_hr, public)]
pub struct EntityPositionHR {
    #[unique]
    pub id: u32,
    pub transform: StdbTransform,
}

// We'll only update this table 5 times per second
#[spacetimedb::table(name = entity_position_lr, public)]
pub struct EntityPositionLR {
    #[unique]
    pub id: u32,
    // You could make other types here which use f16 or another
    // representation to save even more space
    pub transform: StdbTransform,
}

// Intentionally private
#[spacetimedb::table(name = internal_entity_position)]
pub struct InternalEntityPosition {
    #[unique]
    pub id: u32,
    pub transform: StdbTransform,
}

#[spacetimedb::table(name = update_position_timer, scheduled(update_all_positions))]
pub struct UpdatePositionTimer {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    scheduled_at: spacetimedb::ScheduleAt,
}

#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    log::info!("init identity: {:?}", ctx.identity());
    log::info!("init sender: {:?}", ctx.sender);
    ctx.db.update_config().insert(UpdateConfig {
        id: 0,
        value: 0,
    });

    // Schedule our updates 20 times per second
    ctx.db.update_position_timer().insert(UpdatePositionTimer {
        scheduled_id: 0,
        scheduled_at: spacetimedb::ScheduleAt::Interval(Duration::from_millis(1000 / 20).into()),
    });
}

#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(_ctx: &ReducerContext) {
    // Called everytime a new client connects
}

#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(_ctx: &ReducerContext) {
    // Called everytime a client disconnects
}

#[spacetimedb::reducer]
pub fn create_player(ctx: &ReducerContext, username: String) {
    ctx.db.entity().insert(Entity {
        id: 0,
        identity: ctx.sender,
        username,
    });
}

#[spacetimedb::reducer]
pub fn update_position(ctx: &ReducerContext, transform: StdbTransform) {
    // We'll update this user's internal position, not their public position
    let entity = ctx.db.entity().identity().find(ctx.sender).unwrap();
    if ctx
        .db
        .internal_entity_position()
        .id()
        .find(entity.id)
        .is_some()
    {
        ctx.db
            .internal_entity_position()
            .id()
            .update(InternalEntityPosition {
                id: entity.id,
                transform,
            });
    } else {
        ctx.db
            .internal_entity_position()
            .insert(InternalEntityPosition {
                id: entity.id,
                transform,
            });
    }
}

#[spacetimedb::reducer]
pub fn update_all_positions(ctx: &ReducerContext, _arg: UpdatePositionTimer) {
    // We're using this value to determine whether or not to update the lower resolution table.
    // Here we're doing a 4:1 ratio (4 high resolution updates for every 1 low resolution update)
    let mut update = ctx.db.update_config().id().find(0).unwrap();
    // Only let SpacetimeDB call this function
    if ctx.sender != ctx.identity() {
        panic!("wrong owner! This reducer can only be called by SpacetimeDB!");
    }

    let low_resolution = update.value == 0;
    // Update the value in the config table
    update.value = (update.value + 1) % 4;
    ctx.db.update_config().id().update(update);


    // Clear all high res positions
    for row in ctx.db.entity_position_hr().iter() {
        ctx.db.entity_position_hr().id().delete(row.id);
    }

    if low_resolution {
        // Clear all low res positions
        for row in ctx.db.entity_position_lr().iter() {
            ctx.db.entity_position_lr().id().delete(row.id);
        }
    }

    // Update all high res positions
    for row in ctx.db.internal_entity_position().iter() {
        ctx.db.entity_position_hr().insert(EntityPositionHR {
            id: row.id,
            transform: row.transform.clone(),
        });

        if low_resolution {
            // Update all low res positions
            ctx.db.entity_position_lr().insert(EntityPositionLR {
                id: row.id,
                transform: row.transform,
            });
        }
    }
}
