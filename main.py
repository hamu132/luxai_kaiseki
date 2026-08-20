from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/upload")
async def upload_replay(file: UploadFile = File(...)):
    content = await file.read()

    return {
        "filename": file.filename,
        "content": content.decode("utf-8"),
    }