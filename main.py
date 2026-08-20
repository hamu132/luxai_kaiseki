import json

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI()

# GitHub Pagesからのアクセスを許可
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def find_first_city_build_turn(replay: dict) -> dict:
    """
    リプレイから各プレイヤーが初めて都市を建設したターンを取得する。

    Returns:
        {
            "0": 4,
            "1": 4
        }

    都市を建設していない場合は None。
    """

    first_city_build = {
        0: None,
        1: None,
    }

    all_commands = replay.get("allCommands", [])

    for turn, commands in enumerate(all_commands):

        for command_data in commands:
            command = command_data.get("command", "")
            agent_id = command_data.get("agentID")

            if agent_id not in first_city_build:
                continue

            # bcity が都市建設コマンド
            if command.startswith("bcity"):
                if first_city_build[agent_id] is None:
                    first_city_build[agent_id] = turn

    return first_city_build


@app.post("/upload")
async def upload_replay(file: UploadFile = File(...)):
    content = await file.read()

    try:
        replay = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {
            "error": "リプレイファイルをJSONとして読み込めませんでした。"
        }

    first_city_build = find_first_city_build_turn(replay)

    return {
        "filename": file.filename,
        "first_city_build": first_city_build,
    }