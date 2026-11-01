# UI motion and backend probes
- Trades switching animates height as well as content; statistics period rows animate both ways.
- Dialog enter/leave animates together with backdrop blur; reduced-motion disables motion.
- System tile shows response latency, with polling interval as subtitle; connection details unchanged.
- Opening backend picker probes inactive backends using independent API clients; pending/healthy/failure lamps; close/unmount aborts probes; active data source unchanged.
- Verify typecheck, unit tests, lint, formatting, build and e2e.
