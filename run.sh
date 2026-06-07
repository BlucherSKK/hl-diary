#!/bin/bash
set -e

img_to_base64() {
    local file_path="$1"
    if [[ ! -f "$file_path" ]]; then
        echo "Ошибка: Файл '$file_path' не найден." >&2
        return 1
    fi
    local mime_type=$(file -b --mime-type "$file_path")
    local b64_data=$(base64 < "$file_path" | tr -d '\n' | tr -d '\r')
    echo "data:$mime_type;base64,$b64_data"
}

replace_from_file() {
    local TARGET_FILE="$1"
    local LABEL="$2"
    local DATA_FILE="$3"

    if [ ! -f "$TARGET_FILE" ] || [ ! -f "$DATA_FILE" ]; then
        echo "Ошибка: Файлы не найдены."
        return 1
    fi

    export TEMP_LABEL="$LABEL"
    perl -i -pe 'BEGIN{undef $/; open f, "<", "'"$DATA_FILE"'"; $v=<f>; $v =~ s/\R//g; close f} s/\Q$ENV{TEMP_LABEL}\E/$v/g' "$TARGET_FILE"

    echo "${LABEL} заменена"
    unset TEMP_LABEL
}

mkdir -p ./tmp/tempapp
cp -r ./client/* ./tmp/tempapp/

# Inline CSS
cat ./tmp/tempapp/style.css | tr -d '\r\n' | sed 's/  */ /g' > ./tmp/val.tmp
replace_from_file ./tmp/tempapp/index.html "##STYLE##" ./tmp/val.tmp

# Bundle TypeScript → JS
esbuild ./tmp/tempapp/main.ts \
    --bundle \
    --minify \
    --target=es2020 \
    --outfile=./tmp/tempapp/bundle.js

# Inline JS
cat ./tmp/tempapp/bundle.js | tr -d '\r\n' | sed 's/  */ /g' > ./tmp/val.tmp
replace_from_file ./tmp/tempapp/index.html "##SCRIPT##" ./tmp/val.tmp

mv ./tmp/tempapp/index.html ./client.html
rm -rf ./tmp

touch ./src/main.rs

cargo run
