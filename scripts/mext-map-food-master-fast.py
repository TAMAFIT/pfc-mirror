#!/usr/bin/env python3
import importlib.util
import sys
from functools import lru_cache
from pathlib import Path

SCRIPT=Path(__file__).with_name('mext-map-food-master.py')
spec=importlib.util.spec_from_file_location('mext_map_core',SCRIPT)
core=importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)

# A full Food Master pass evaluates the same MEXT names against hundreds of app
# foods. Cache Unicode normalization and bigrams so maintenance CI stays fast.
core.norm=lru_cache(maxsize=32768)(core.norm)
core.bigrams=lru_cache(maxsize=32768)(core.bigrams)

if __name__=='__main__':
    sys.exit(core.main())
