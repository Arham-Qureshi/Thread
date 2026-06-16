LOCAL_EMCC = ../../emsdk/upstream/emscripten/emcc
EMCC ?= $(if $(wildcard $(LOCAL_EMCC)),$(LOCAL_EMCC),emcc)
SRC = GraphBuilder.cpp textrank.cpp
OUT_DIR = build
OUT_JS = $(OUT_DIR)/thread_engine.js
OUT_WASM = $(OUT_DIR)/thread_engine.wasm

# Strictly single-threaded. No PThreads.
CFLAGS = -O2 \
	-s MODULARIZE=1 \
	-s EXPORT_NAME="createThreadEngine" \
	-s EXPORT_ES6=1 \
	-s ENVIRONMENT=worker \
	-s EXPORTED_FUNCTIONS="['_processString', '_buildGraph', '_malloc', '_free']" \
	-s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','UTF8ToString']" \
	-s ALLOW_MEMORY_GROWTH=1 \
	-s NO_EXIT_RUNTIME=1 \
	--no-entry

all: $(OUT_JS)

$(OUT_JS): $(SRC) | $(OUT_DIR)
	$(EMCC) $(SRC) -o $(OUT_JS) $(CFLAGS)

$(OUT_DIR):
	mkdir -p $(OUT_DIR)

clean:
	rm -rf $(OUT_DIR)

.PHONY: all clean
