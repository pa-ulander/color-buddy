#include <stdio.h>

int main(void) {
  const char *css = "color: var(--primary-color)";
  printf("%s", css);
  return 0;
}
