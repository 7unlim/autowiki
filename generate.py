from datasets import load_dataset

# Load the OpenWebText dataset
dataset = load_dataset("openwebtext", split="train")

# Save the first 1000 documents as an example
with open("openwebtext_sample.txt", "w") as f:
    for i, item in enumerate(dataset):
        f.write(item["text"].replace('\n', ' ') + "\n\n")
        if i >= 999:
            break