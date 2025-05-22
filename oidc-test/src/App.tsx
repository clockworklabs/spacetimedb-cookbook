import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Callback from "./pages/Callback";
import Home from "./pages/Home";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/callback" element={<Callback />} />
      </Routes>
    </Router>
  );
}
