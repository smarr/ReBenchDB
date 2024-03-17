#!/usr/bin/env python3
import sys

if len(sys.argv) != 3:
    print("Usage: test-vm.py <benchmark> <number-of-iterations>")
    sys.exit(1)

criteria = {
    "mem": {"unit": "MB", "step": 3},
    "compile": {"unit": "ms", "step": 7},
    "total": {"unit": "ms", "step": 1},
}

benchmark_name = sys.argv[1]
num_iterations = int(sys.argv[2])

for i in range(1, num_iterations + 1):
    for n, c in criteria.items():
        if i % c["step"] == 0:
            print(f"{benchmark_name}: {n}: {i}{c['unit']}")