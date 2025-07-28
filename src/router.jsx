import { Route, Routes } from "react-router-dom";
import App from "./app";

function Router() {
  return (
    <Routes>
      <Route path="/" element={<App />}>
        <Route index element={<h1>Home</h1>} />
      </Route>
    </Routes>
  );
}

export default Router;