#! /usr/bin/python

from time import sleep

import stdb

def on_applied():
    print("Subscriptions completed")

def on_error(err: str):
    print(f"Error setting up subscriptions\n: {err}")
    quit(1)

def main():
    HOST = "http://localhost:3000"
    DBNAME = "test"

    ctx = stdb.connect(HOST, DBNAME);
    ctx.run_threaded()
    print("Connected!")

    subs = ["SELECT * FROM person"]
    ctx.subscribe(subs, on_applied, on_error)

    stdb.reducers.add(ctx,"Myname1")
    stdb.reducers.say_hello(ctx)
    print("Called reducers")
    
    counter = 0
    while True:
        sleep(1)
        counter += 1

        if counter == 5:
            persons = stdb.db.person.iter(ctx)

            if len(persons) != 0:
                print('Printing person table')
                for person in persons:
                    print(f"-> {person.name}")
                print('Done Printing person table')

            else:
                print('Person table is empty')

            counter = 0


if __name__ == '__main__':
    main()
