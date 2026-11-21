import { Router as WouterRouter, Route, Switch } from "wouter";
import Navbar from "@/components/Navbar";
import Home from "@/pages/Home";
import MorphologicalAnalyzer from "@/pages/MorphologicalAnalyzer";
import ContinuousReading from "@/pages/ContinuousReading";

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <Navbar />
        <div className="min-h-0 flex-1 overflow-hidden">
          <Switch>
            <Route path="/" component={MorphologicalAnalyzer} />
            <Route path="/morphology" component={MorphologicalAnalyzer} />
            <Route path="/continuous-reading" component={ContinuousReading} />
            <Route path="/word-lookup" component={Home} />
            <Route path="*">
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Page not found.
              </div>
            </Route>
          </Switch>
        </div>
      </div>
    </WouterRouter>
  );
}

export default App;
