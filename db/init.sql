CREATE TABLE authors (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  country    text NOT NULL DEFAULT '' CHECK (length(country) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE books (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id   integer NOT NULL REFERENCES authors ON DELETE CASCADE,
  title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  isbn        text NOT NULL UNIQUE CHECK (isbn ~ '^[0-9]{13}$'),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  stock       integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX books_author_id_idx ON books (author_id);
