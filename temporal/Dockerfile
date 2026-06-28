FROM ruby:3.4.8-slim

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
    build-essential git libyaml-dev pkg-config && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

ENV BUNDLE_PATH="/usr/local/bundle"

WORKDIR /app

COPY Gemfile Gemfile.lock ./
RUN bundle install

EXPOSE 7234

CMD ["bundle", "exec", "ruby", "workers/ingestion_worker.rb"]
