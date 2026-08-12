#!/usr/bin/env python3
import importlib.util
import re
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

# MEXT official names contain taxonomy/group labels such as ＜いか・たこ類＞
# and （トマト類）. Those are not the food identity and can cause false lexical
# matches (e.g. イカ -> まだこ). Strip only group wrappers before name scoring.
_base_name_score=core.name_score
def safe_name_score(item, official_name):
    text=str(official_name or '')
    text=re.sub(r'＜[^＞]+＞',' ',text)
    text=re.sub(r'[（(][^）)]*類[^）)]*[）)]',' ',text)
    return _base_name_score(item,text)
core.name_score=safe_name_score

# Candidate confidence and source promotion are separate gates. A candidate can
# be high-confidence but must also be in current nutrition parity before it is
# safe to auto-promote without changing food values.
_base_classify=core.classify_item
def safe_classify(item, rows):
    result=_base_classify(item,rows)
    result['autoPromotable']=bool(result.get('status')=='high' and result.get('nutritionInParity') is True)
    return result
core.classify_item=safe_classify

if __name__=='__main__':
    sys.exit(core.main())
