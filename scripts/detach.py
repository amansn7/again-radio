#!/usr/bin/env python3
"""Run a long command fully detached so the shell tool cannot kill it.

usage: python3 scripts/detach.py .orchestrator/logs/unit.log agy --print "..." --model claude-sonnet-4-6

Prints the pid. Poll with: ps -p <pid> > /dev/null && echo running || echo done
"""
import subprocess
import sys

if len(sys.argv) < 3:
    sys.exit("usage: detach.py <logfile> <cmd...>")

log, cmd = sys.argv[1], sys.argv[2:]
with open(log, "ab") as f:
    p = subprocess.Popen(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=f,
        stderr=f,
        start_new_session=True,
        close_fds=True,
    )
print(p.pid)
