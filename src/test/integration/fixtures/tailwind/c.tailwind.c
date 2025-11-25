#include <stdio.h>

int main(void) {
  const char *classes = "bg-primary hover:bg-primary focus:text-accent text-accent from-primary via-accent to-accent";
  printf("%s", classes);
  return 0;
}
