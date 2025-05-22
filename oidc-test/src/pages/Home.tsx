import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import { Stdb } from "../Stdb";

export default function Home() {
  const auth = useAuth();
  const [spacetime, setSpacetime] = useState<Stdb>();
  const [stdbInitialized, setStdbInitialized] = useState<boolean>(false);

  const handleUpdate = (e: any) => {
    e.preventDefault();
    if(!spacetime) return;
    spacetime.conn.reducers.updateSelf(e.target[0].value, e.target[1].value);
  }

  useEffect(() => {
    if(!auth.isAuthenticated) return;
    if(!auth.user) return;
    if(!auth.user.id_token) return;

    const tempStdb = new Stdb("ws://localhost:3000", "MODULE_NAME", auth.user.access_token);
    tempStdb.addEventListener('connect', () => {
        setStdbInitialized(true);
    });

    setSpacetime(tempStdb);
  }, [auth.isAuthenticated, auth.user]);

  if (auth.isLoading) {
    return <p>Loading...</p>;
  }

  if(!auth.isAuthenticated) return (
    <div>
        <button onClick={() => auth.signinRedirect()}>Login with XYZ</button>
    </div>
  );

  if(auth.isAuthenticated && !stdbInitialized) return (
    <div>
        Connecting to SpacetimeDB...
    </div>
  )

  // some example code of what you can do when you're auth'd. 
  // the name/bio won't automatically rerender since they're not react state stuff, but you get the idea
  if(auth.isAuthenticated && spacetime && stdbInitialized) return (
    <div>
        <div>Welcome {spacetime.identity.toHexString()}!</div>
        <form onSubmit={handleUpdate}>
            <label htmlFor="fname">Name: </label>
            <input type="text" id="name" name="fname" value={spacetime.conn.db.person.identity.find(spacetime.identity)?.name} /><br />
            <label htmlFor="fbio">Bio: </label>
            <input type="text" id="bio" name="fbio" value={spacetime.conn.db.person.identity.find(spacetime.identity)?.bio} /><br />
            <input type="submit" value="Update" />
        </form>
        <button onClick={() => auth.signoutRedirect()}>Sign out</button>
    </div>
  )
}
