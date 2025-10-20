mod module_bindings;

use std::ops::Deref;

use anyhow::{Error as AnyError, Result};
use module_bindings::{add, say_hello, PersonTableAccess};
use pyo3::prelude::*;
use spacetimedb_sdk::{DbContext, Table};

use crate::module_bindings::{DbConnection, Person};

#[pymodule(name = "stdb")]
fn stdb(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(connect, m)?)?;

    let reducers = PyModule::new(m.py(), "reducers")?;
    setup_reducers(&reducers)?;

    let db = PyModule::new(m.py(), "db")?;
    setup_db(&db)?;

    m.add_submodule(&reducers)?;
    m.add_submodule(&db)?;
    Ok(())
}

fn setup_reducers(m: &Bound<PyModule>) -> Result<()> {
    m.add_function(wrap_pyfunction!(add_reducer, m)?)?;
    m.add_function(wrap_pyfunction!(say_hello_reducer, m)?)?;

    Ok(())
}

fn setup_db(m: &Bound<PyModule>) -> Result<()> {
    let person_mod = PyModule::new(m.py(), "person")?;
    person_mod.add_function(wrap_pyfunction!(person_iter, m)?)?;

    m.add_submodule(&person_mod)?;

    Ok(())
}

#[pyfunction]
fn connect(host_uri: &str, db_name: &str) -> Result<SpacetimeCtx> {
    Ok(SpacetimeCtx {
        inner: DbConnection::builder()
            .with_module_name(db_name)
            .with_uri(host_uri)
            .build()
            .map_err(AnyError::from)?,
    })
}

#[pyclass]
struct SpacetimeCtx {
    inner: DbConnection,
}

#[pymethods]
impl SpacetimeCtx {
    pub fn run_threaded(&self) {
        self.inner.run_threaded();
    }

    pub fn subscribe(
        &self,
        subs: Vec<String>,
        on_applied: Option<PyObject>,
        on_error: Option<PyObject>,
    ) {
        self.subscription_builder()
            .on_applied(move |_| {
                if let Some(f) = on_applied {
                    Python::with_gil(|py| {
                        let func = f.bind(py);
                        if func.is_callable() {
                            func.call0().expect("Failed to call on_applied hook");
                        }
                    });
                }
            })
            .on_error(move |_, e| {
                if let Some(f) = on_error {
                    Python::with_gil(|py| {
                        let func = f.bind(py);
                        if func.is_callable() {
                            func.call1((e.to_string(),))
                                .expect("Failed to call on_error hook");
                        }
                    });
                }
            })
            .subscribe(subs);
    }

    pub fn subscribe_to_all(&self) {
        self.subscription_builder().subscribe_to_all_tables();
    }
}

impl Deref for SpacetimeCtx {
    type Target = DbConnection;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

// reducers

#[pyfunction(name = "add")]
fn add_reducer(ctx: &SpacetimeCtx, name: String) -> Result<()> {
    ctx.reducers.add(name).map_err(AnyError::from)
}

#[pyfunction(name = "say_hello")]
fn say_hello_reducer(ctx: &SpacetimeCtx) -> Result<()> {
    ctx.reducers.say_hello().map_err(AnyError::from)
}

#[pyclass]
struct PyPerson {
    inner: Person,
}

impl From<Person> for PyPerson {
    fn from(value: Person) -> Self {
        Self { inner: value }
    }
}

#[pymethods]
impl PyPerson {
    #[getter]
    pub fn name(&self) -> String {
        self.inner.name.clone()
    }
}

#[pyfunction(name = "iter")]
fn person_iter(ctx: &SpacetimeCtx) -> Result<Vec<PyPerson>> {
    Ok(ctx.db.person().iter().map(|p| p.into()).collect())
}
