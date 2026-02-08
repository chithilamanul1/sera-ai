from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import os
import logging

# --- Setup Logging ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SinLlama-Service")

app = FastAPI(title="Sera Auto AI Service (SinLlama)")

# --- Configuration ---
MODEL_NAME = "polyglots/SinLlama_v01"
DEVICE = "cpu"  # Default to CPU, will check for CUDA

# Check for CUDA
try:
    import torch
    if torch.cuda.is_available():
        DEVICE = "cuda"
        logger.info(f"CUDA available: {torch.cuda.get_device_name(0)}")
    else:
        logger.info("CUDA not available, using CPU (will be slow)")
except ImportError:
    logger.warning("PyTorch not installed properly")

# --- Global Model Storage ---
model = None
tokenizer = None
load_error = None

def load_model():
    global model, tokenizer, load_error
    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        
        logger.info(f"Downloading/Loading model: {MODEL_NAME}...")
        logger.info("This may take several minutes on first run...")
        
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
        
        if DEVICE == "cuda":
            logger.info("Loading with GPU acceleration...")
            model = AutoModelForCausalLM.from_pretrained(
                MODEL_NAME,
                device_map="auto",
                torch_dtype=torch.float16,
                trust_remote_code=True
            )
        else:
            logger.info("Loading on CPU (this will be slow)...")
            model = AutoModelForCausalLM.from_pretrained(
                MODEL_NAME,
                torch_dtype=torch.float32,
                trust_remote_code=True
            )
            
        logger.info("✅ Model Loaded Successfully!")
        
    except Exception as e:
        load_error = str(e)
        logger.error(f"❌ Failed to load model: {e}")

class GenerateRequest(BaseModel):
    prompt: str
    max_length: int = 150

@app.on_event("startup")
async def startup_event():
    load_model()

@app.get("/")
def health_check():
    if model:
        return {"status": "online", "model": MODEL_NAME, "device": DEVICE}
    else:
        return {"status": "offline (model failed)", "model": MODEL_NAME, "device": DEVICE, "error": load_error}

@app.post("/generate")
def generate_text(req: GenerateRequest):
    if not model or not tokenizer:
        raise HTTPException(status_code=503, detail=f"Model not loaded: {load_error}")
    
    try:
        import torch
        inputs = tokenizer(req.prompt, return_tensors="pt")
        if DEVICE == "cuda":
            inputs = inputs.to("cuda")
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=req.max_length,
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                pad_token_id=tokenizer.eos_token_id
            )
            
        generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        return {"response": generated_text}
        
    except Exception as e:
        logger.error(f"Generation Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
