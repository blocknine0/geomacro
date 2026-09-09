import asyncio
import json
import os
import signal
import sys


async def stream_process(
    name: str,
    *args: str,
) -> int:
    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=os.environ.copy(),
    )

    async def pump(
        stream: asyncio.StreamReader | None,
        destination,
    ) -> None:
        if stream is None:
            return

        while True:
            line = await stream.readline()
            if not line:
                break

            text = line.decode("utf-8", errors="replace").rstrip("\n")
            print(
                json.dumps(
                    {
                        "process": name,
                        "message": text,
                    },
                    ensure_ascii=False,
                ),
                file=destination,
                flush=True,
            )

    stdout_task = asyncio.create_task(pump(process.stdout, sys.stdout))
    stderr_task = asyncio.create_task(pump(process.stderr, sys.stderr))

    return_code = await process.wait()
    await asyncio.gather(stdout_task, stderr_task)

    return return_code


async def main() -> None:
    commands = [
        ("intake", sys.executable, "production_entrypoint.py"),
        ("corroboration", sys.executable, "corroboration_loop.py"),
    ]

    tasks = {
        asyncio.create_task(
            stream_process(name, *command),
            name=name,
        ): name
        for name, *command in commands
    }

    done, pending = await asyncio.wait(
        tasks,
        return_when=asyncio.FIRST_COMPLETED,
    )

    failed_name = "unknown"
    failed_code = 1

    for task in done:
        failed_name = tasks[task]
        try:
            failed_code = int(task.result())
        except Exception as exc:
            print(
                json.dumps(
                    {
                        "supervisor": "child_exception",
                        "process": failed_name,
                        "error": str(exc),
                    }
                ),
                file=sys.stderr,
                flush=True,
            )
            failed_code = 1

    for task in pending:
        task.cancel()

    await asyncio.gather(*pending, return_exceptions=True)

    raise RuntimeError(
        f"Breaking-news worker process exited: {failed_name} code={failed_code}"
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        signal.signal(signal.SIGINT, signal.SIG_DFL)