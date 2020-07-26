# Plots
library(ggplot2)
library(ggstance)

warmup_plot <- function (data_b, b, s, e) {
  ## First take the medians over the values for each commitid separately
  medians <- data_b %>%
    group_by(commitid) %>%
    summarise(median = median(value),
    .groups = "drop")

  # use the highest one with a little margin as an upper bound
  upperBound <- 2 * max(medians$median)

  plot <- ggplot(data_b, aes(x=iteration, y=value)) +
    geom_line(aes(colour = commitid)) +
    scale_color_manual(values = color) +
    # ggtitle(paste(b, s, e)) +
    ylab(levels(data_b$unit)) +
    # scale_x_continuous(breaks = seq(0, max(data_b$iteration), 10)) +
    coord_cartesian(ylim=c(0, upperBound)) +
    geom_vline(
      xintercept = seq(0, max(data_b$iteration), 50),
      linetype = "longdash", colour = "#cccccc") +
    theme_simple(8) +
    theme(legend.position=c(0.92, .92))
  print(plot)
}

negative_geometric.mean <- function(d) {
  # just shift values temporarily away from 0,
  # transformation doesn't change results when using a sufficiently large constant
  # normally, one would use simply 1, but in this case, it may change the results
  # fixed_geomean should really only be used in the context of stat_summary
  m <- geometric.mean(d + 10000000)
  m - 10000000
}

compare_runtime_ratio_of_suites_plot <- function (
    data, slower_runtime_ratio, faster_runtime_ratio, fast_color, slow_color, scale_color) {
  ggplot(data, aes(ratio, suite, fill=slower)) +
    geom_vline(aes(xintercept=1), colour="#999999", linetype="solid") +
    geom_vline(aes(xintercept=slower_runtime_ratio), colour="#cccccc", linetype="dashed") +
    geom_vline(aes(xintercept=faster_runtime_ratio), colour="#cccccc", linetype="dashed") +
    geom_boxploth(aes(colour = commitid),
                  outlier.size = 0.9,
                  outlier.alpha = 0.6) +
    stat_summaryh(fun.x = negative_geometric.mean,
                  size = 1, colour = "#503000", geom = "point") +
    scale_x_log10() +
    ylab("") +
    coord_cartesian(xlim=c(0.5, 2.5)) +
    theme_simple(8) +
    scale_color_manual(values = scale_color) +
    scale_fill_manual(breaks=c("slower", "faster", "indeterminate"),
                      values=c(fast_color, slow_color, NA)) +
    theme(legend.position = "none")
}

small_inline_comparison <- function (data) {
  ggplot(data, aes(ratio_median, bench)) +
        geom_vline(aes(xintercept=1), colour="#333333", linetype="solid") +
        geom_boxploth(aes(colour = commitid),
                          outlier.size = 0.9,
                          outlier.alpha = 0.6) +
        scale_x_log10() +
        coord_cartesian(xlim=c(0.5, 5)) +
        theme_simple(5) +
        ylab("") +
        scale_color_manual(values = color) +
        scale_fill_manual(values = color) +
        theme(legend.position = "none",
              axis.ticks.y=element_blank(),
              axis.text.y=element_blank(),
              axis.ticks.length.x = unit(-.05, "cm"),
              axis.text.x = element_text(margin = margin(t = 0.1, unit = "cm")),
              axis.line.y.left=element_blank(),
              axis.line.x.bottom=element_blank())
}

##
## Theme Settings
##
theme_simple <- function(font_size = 8) {
  theme_bw() +
    theme(axis.text.x          = element_text(size = font_size, lineheight=0.7),
          axis.title.x         = element_blank(),
          axis.title.y         = element_text(size = font_size),
          axis.text.y          = element_text(size = font_size),
          axis.line            = element_line(colour = "gray"),
          plot.title           = element_text(size = font_size),
          legend.text          = element_text(size = font_size),
          legend.title         = element_blank(),
          legend.background    = element_blank(),
          panel.background     = element_blank(), #element_rect(fill = NA, colour = NA),
          panel.grid.major     = element_blank(),
          panel.grid.minor     = element_blank(),
          panel.border         = element_blank(),
          plot.background      = element_blank(), #element_rect(fill = NA, colour = NA)
          strip.background     = element_blank(),
          strip.text           = element_text(size = font_size),
          plot.margin = unit(c(0,0,0,0), "cm"))
}

element90 <- function() { element_text(angle = 90, hjust = 1, vjust=0.5) }
