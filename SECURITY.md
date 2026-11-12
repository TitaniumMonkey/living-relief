# Security

Living Relief builds to static browser assets. For hosting, serve `dist/client`
from a static web server. Development/preview tooling is not a production server.
The app uses bundled geographic data rather than runtime mapping credentials.

Do not put private itineraries, credentials or access tokens in this repository.
Run `npm audit`, the tests and a production build after changing dependencies.
An audit finding is not by itself proof of runtime exploitability; check the
actual path and distinguish browser code from development tooling.

Report security issues privately through the repository's security-advisory
channel if enabled; otherwise contact the maintainer without posting secrets or
exploit details publicly.
