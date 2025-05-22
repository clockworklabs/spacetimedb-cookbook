#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <thread>
#include <vector>

#include "stdb.hpp"

void on_applied() {
  printf("Subscriptions completed \n");
}

void on_error(std::string& err) {
  printf("Error Setting up subscriptions:\n%s\n", err.c_str());
  exit(1);
}

int main () {
  auto HOST = std::string("http://localhost:3000");
  auto DBNAME = std::string("test");

  auto ctx = stdb::connect(HOST, DBNAME);
  stdb::run_threaded(*ctx);

  std::vector<std::string> subs = {"SELECT * FROM person"};
  stdb::subscribe(*ctx, subs, (std::size_t)reinterpret_cast<void*>(&on_applied), (std::size_t)reinterpret_cast<void*>(&on_error));

  stdb::reducers::add(*ctx, std::string("Myname"));
  stdb::reducers::say_hello(*ctx);

  auto counter = 0;
  while (true) {
    std::this_thread::sleep_for(std::chrono::milliseconds(1000));
    counter += 1;

    if (counter == 5) {
      // print table
      auto persons = stdb::tables::person::iter(*ctx);
      if (persons.size() > 0) {
        printf("Printing person table: %zu\n", persons.size());
        for (auto& p: persons) {
          auto name = stdb::tables::person::name(p);
          printf("-> %s\n", name.c_str());
        }
        printf("Done Printing person table\n");

      } else {
        printf("Person table is empty\n");
      }
      counter = 0;
    }
  }

  return 0;
}

