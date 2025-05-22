import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { useNavigate } from "react-router-dom";

export default function Callback() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate("/");
    } else if (!auth.activeNavigator && window.location.search) {
      auth.signinSilent().catch((error) => {
        console.log(error);
        navigate("/");
      });
    }
  }, [auth, navigate]);

  return <div>Redirecting...</div>;
}
