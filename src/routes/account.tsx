import {createFileRoute,Navigate} from "@tanstack/react-router";
/** /account is a stable alias for the existing, session-protected dashboard. */
export const Route=createFileRoute("/account")({
  head:()=>({meta:[{title:"GeoMacro account"},
    {name:"robots",content:"noindex,nofollow"}]}),
  component:()=> <Navigate to="/dashboard" replace />,
});
