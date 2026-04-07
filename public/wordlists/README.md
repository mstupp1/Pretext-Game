Source: https://github.com/MagicOctopusUrn/wordListsByLength
Commit: d54ae5d8feaf6f2f3bcba98e66c1ed8fa5c72809

This project vendors the upstream word lists as static assets and lazy-loads
them by word length at runtime. The game uses lengths 3-27; upstream does not
include a 26-letter bucket, so missing buckets are treated as empty.
