import { Outlet } from "react-router-dom";
import "./app.css";

function App(){
    return(
        <div className="app-div">
            <h1>App</h1>
            <Outlet />
        </div>
    )
}

export default App;