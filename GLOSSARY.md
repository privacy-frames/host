# Privacy Frames

Privacy Frames installs applications and runs them under a host-controlled
confinement policy while preserving their expected browser behavior.

## Language

**Host service worker**:
The trusted browser service worker responsible for the host's resource delivery
and request policy.

**Application service-worker behavior**:
The service-worker API and lifecycle behavior an installed application expects
from its execution environment. It remains subject to the host's confinement
policy.

**Compatibility contract**:
The application workflows and browser behavior the greenfield host must
preserve, together with the conditions and evidence used to judge that support.
