-- Enabled automatically by the postgis/postgis image's own bootstrap in
-- most cases; kept explicit so a plain postgres image can be swapped in
-- later without silently losing PostGIS support.
CREATE EXTENSION IF NOT EXISTS postgis;
