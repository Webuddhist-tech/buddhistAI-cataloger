from typing_extensions import Literal
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import requests
from botok.tokenizers.sentencetokenizer import sentence_tokenizer
from botok.tokenizers.wordtokenizer import WordTokenizer
from botok.config import Config
from pathlib import Path
load_dotenv(override=True)

router = APIRouter()
API_ENDPOINT = os.getenv("OPENPECHA_ENDPOINT")


class TokenizeRequest(BaseModel):
    text: str
    type: Literal["word", "sentence"] = "word"


@router.post("")
def tokenize(request: TokenizeRequest):
    if not API_ENDPOINT:
        raise HTTPException(
            status_code=500, 
            detail="OPENPECHA_ENDPOINT environment variable is not set"
        )
    
    try: 
        tokenized_text = tokenize_text(request.text, request.type)
        return tokenized_text
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="Request to OpenPecha API timed out after 30 seconds"
        )
    

config = Config(dialect_name="general", base_path=Path("config_botok"))

def tokenize_text(text: str, type: Literal["word", "sentence"] = "word"):
    try:
        tokenizer = WordTokenizer()
    except ModuleNotFoundError as e:
        # If pickle file is incompatible (e.g., missing 'third_party' module),
        # rebuild the trie by setting build_trie=True
        if 'third_party' in str(e) or 'No module named' in str(e):
            tokenizer = WordTokenizer(build_trie=True,config=config)
        else:
            raise
    clean_text = text.replace("\n", "")
    tokens = tokenizer.tokenize(clean_text)
    if type == "word":
        word_tokens = [token.text for token in tokens if hasattr(token, 'text') and token.text]
        return word_tokens
    sentence_tokens = sentence_tokenizer(tokens)
    segments = []
    current_segment = ""
    for sentence_index, sentence_token in enumerate(sentence_tokens):
        sentence_text = ''
        for token in sentence_token['tokens']:
            sentence_text += token["text"]
        current_segment += sentence_text
        if sentence_text.endswith("། ") or sentence_text.endswith("།"):
            segments.append(current_segment)
            current_segment = ""
    if current_segment:
        segments.append(current_segment)
    return segments
